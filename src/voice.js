import * as THREE from 'three';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Mesh WebRTC voice between up to 6 shipmates. The newest joiner initiates
// offers to everyone already aboard; existing crew only answer, so there is
// no offer glare. Remote audio is spatialised with THREE.PositionalAudio so
// voices fade with distance (proximity chat).
export class Voice {
  constructor(net, listener) {
    this.net = net;           // used for sendSignal + remotes lookup
    this.listener = listener; // THREE.AudioListener on the camera
    this.peers = new Map();   // peerId -> { pc, audioEl, posAudio, analyser, buf }
    this.localStream = null;
    this.localAnalyser = null;
    this.muted = false;
    this.available = false;
  }

  async init() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      this.available = true;
      this.localAnalyser = this._makeAnalyser(this.localStream);
    } catch (err) {
      console.warn('Microphone unavailable, voice chat disabled:', err);
      this.available = false;
    }
    return this.available;
  }

  _makeAnalyser(stream) {
    const ctx = this.listener.context;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    return { analyser, buf: new Uint8Array(analyser.frequencyBinCount) };
  }

  _level(a) {
    if (!a) return 0;
    a.analyser.getByteTimeDomainData(a.buf);
    let sum = 0;
    for (let i = 0; i < a.buf.length; i++) {
      const v = (a.buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / a.buf.length) * 7);
  }

  getLocalLevel() {
    return this.muted ? 0 : this._level(this.localAnalyser);
  }

  // map of peerId -> 0..1 speech level, for talk indicators
  getLevels() {
    const out = {};
    for (const [id, entry] of this.peers) {
      if (entry.analyser) out[id] = this._level(entry);
    }
    return out;
  }

  setMuted(m) {
    this.muted = m;
    if (this.localStream) {
      for (const t of this.localStream.getAudioTracks()) t.enabled = !m;
    }
  }

  _newPeer(peerId) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const entry = { pc, audioEl: null, posAudio: null };
    this.peers.set(peerId, entry);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    } else {
      // still receive audio even without a mic
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) this.net.sendSignal(peerId, { candidate: e.candidate });
    };
    pc.ontrack = (e) => this._attachRemoteAudio(peerId, e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        // peer-left from the server is the authoritative cleanup; this just
        // stops dead connections from lingering after network failures
        if (pc.connectionState === 'failed') this.closePeer(peerId);
      }
    };
    return entry;
  }

  async callPeer(peerId) {
    const { pc } = this._newPeer(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.net.sendSignal(peerId, { sdp: pc.localDescription });
  }

  async handleSignal(from, data) {
    let entry = this.peers.get(from);
    try {
      if (data.sdp) {
        if (data.sdp.type === 'offer') {
          if (!entry) entry = this._newPeer(from);
          await entry.pc.setRemoteDescription(data.sdp);
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          this.net.sendSignal(from, { sdp: entry.pc.localDescription });
        } else if (entry) {
          await entry.pc.setRemoteDescription(data.sdp);
        }
      } else if (data.candidate && entry) {
        await entry.pc.addIceCandidate(data.candidate);
      }
    } catch (err) {
      console.warn('WebRTC signal error from', from, err);
    }
  }

  _attachRemoteAudio(peerId, stream) {
    const entry = this.peers.get(peerId);
    if (!entry || entry.posAudio) return;

    // Chrome quirk: WebRTC audio only flows into WebAudio if the stream is
    // also attached to a (muted) media element.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    el.play().catch(() => {});
    entry.audioEl = el;
    const a = this._makeAnalyser(stream);
    entry.analyser = a.analyser;
    entry.buf = a.buf;

    const remote = this.net.remotes.get(peerId);
    if (!remote) return;

    const posAudio = new THREE.PositionalAudio(this.listener);
    posAudio.setMediaStreamSource(stream);
    posAudio.setRefDistance(1.6);
    posAudio.setRolloffFactor(2.2);
    posAudio.setDistanceModel('exponential');
    remote.group.add(posAudio);
    entry.posAudio = posAudio;
  }

  closePeer(peerId) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    entry.pc.close();
    if (entry.audioEl) { entry.audioEl.srcObject = null; }
    if (entry.posAudio) {
      entry.posAudio.removeFromParent();
      try { entry.posAudio.disconnect(); } catch {}
    }
    this.peers.delete(peerId);
  }
}
