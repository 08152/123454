// No game server: this only links tabs/windows from the same browser profile using BroadcastChannel.
// It is intentionally not internet matchmaking and does not connect separate devices.
export function createMatchmaking({ onPlayersChanged, onMatchFound, onPeerState, onPeerEvent }) {
  const id = (globalThis.crypto?.randomUUID?.() || `p-${Math.random().toString(36).slice(2)}-${Date.now()}`);
  let channel = null;
  let searching = false;
  let started = false;
  const peers = new Map();
  let presenceTimer = null;
  let stateTimer = null;
  let latestState = null;
  let lastPresence = 0;

  const emitCount = () => {
    const now = Date.now();
    for (const [peerId, peer] of peers) if (now - peer.lastSeen > 4500) peers.delete(peerId);
    onPlayersChanged?.(Math.min(2, peers.size + 1));
  };
  const send = message => { try { channel?.postMessage({ ...message, from: id, sentAt: Date.now() }); } catch {} };
  const onMessage = event => {
    const msg = event.data;
    if (!msg || msg.from === id) return;
    if (msg.type === 'presence') {
      if (msg.searching) peers.set(msg.from, { lastSeen: Date.now(), state: msg.state || null });
      else peers.delete(msg.from);
      emitCount();
      if (searching && !started && peers.size >= 1) {
        started = true;
        send({ type: 'match-found' });
        onMatchFound?.();
      }
    } else if (msg.type === 'match-found' && searching && !started) {
      started = true;
      onMatchFound?.();
    } else if (msg.type === 'state') {
      peers.set(msg.from, { lastSeen: Date.now(), state: msg.state || null });
      onPeerState?.(msg.from, msg.state);
      emitCount();
    } else if (msg.type === 'action') {
      onPeerEvent?.(msg.action, msg.payload, msg.from);
    }
  };

  function ensureChannel() {
    if (channel || !('BroadcastChannel' in window)) return;
    channel = new BroadcastChannel('island-drop-matchmaking-v1');
    channel.addEventListener('message', onMessage);
  }
  function startSearch() {
    ensureChannel(); searching = true; started = false;
    if (!channel) { onPlayersChanged?.(1); return; }
    send({ type: 'presence', searching: true });
    clearInterval(presenceTimer);
    presenceTimer = setInterval(() => {
      if (!searching || !channel) return;
      send({ type: 'presence', searching: true, state: latestState });
      emitCount();
    }, 900);
    emitCount();
    // Give existing waiting tabs a moment to notice this one.
    setTimeout(() => {
      if (searching && !started && peers.size >= 1) {
        started = true; send({ type: 'match-found' }); onMatchFound?.();
      }
    }, 250);
  }
  function stopSearch() {
    searching = false; started = false;
    if (channel) send({ type: 'presence', searching: false });
    clearInterval(presenceTimer); presenceTimer = null;
    emitCount();
  }
  function sendState(state) {
    latestState = state;
    if (channel && !searching) send({ type: 'state', state });
  }
  function sendAction(action, payload) {
    if (channel && !searching) send({ type: 'action', action, payload });
  }
  function destroy() {
    stopSearch(); clearInterval(stateTimer); channel?.removeEventListener('message', onMessage); channel?.close(); channel = null;
  }
  window.addEventListener('beforeunload', destroy, { once: true });
  return { id, startSearch, stopSearch, sendState, sendAction, getPeerCount: () => peers.size + 1, destroy };
}
