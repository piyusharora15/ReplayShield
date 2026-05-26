let io;

const initSocketManager = (socketIo) => {
  io = socketIo;
};

const getIO = () => io;

const emitAttackDetected = (attackData) => {
  if (io) {
    io.emit("attack_detected", {
      ...attackData,
      timestamp: new Date().toISOString(),
    });
  }
};

const emitTransactionUpdate = (txData) => {
  if (io) {
    io.emit("transaction_update", {
      ...txData,
      timestamp: new Date().toISOString(),
    });
  }
};

const emitPreventionToggle = (status) => {
  if (io) {
    io.emit("prevention_toggled", {
      enabled: status,
      timestamp: new Date().toISOString(),
    });
  }
};

module.exports = {
  initSocketManager,
  getIO,
  emitAttackDetected,
  emitTransactionUpdate,
  emitPreventionToggle,
};