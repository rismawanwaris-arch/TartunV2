const EventEmitter = require('events');

class DataReactor extends EventEmitter {}
const dataReactor = new DataReactor();
dataReactor.setMaxListeners(500);

let currentVersion = Date.now();

/**
 * Broadcast event perubahan data ke semua subscriber (SSE stream / event listener).
 * @param {Object} payload Informasi perubahan data (eventType, count, batch_id, dll.)
 */
function broadcastDataChange(payload = {}) {
  currentVersion = Date.now();
  dataReactor.emit('change', {
    version: currentVersion,
    timestamp: currentVersion,
    ...payload
  });
}

function getReactorVersion() {
  return currentVersion;
}

module.exports = {
  dataReactor,
  broadcastDataChange,
  getReactorVersion
};
