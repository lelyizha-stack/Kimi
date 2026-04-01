(() => {
  function getPickleApi() {
    if (!window.pickleparser || typeof window.pickleparser.Parser !== "function") {
      throw new Error("pickleparser belum termuat di browser.");
    }
    return window.pickleparser;
  }

  function parseLogBuffer(logBuffer) {
    if (!(logBuffer instanceof ArrayBuffer)) {
      throw new Error("logBuffer Ren'Py tidak valid.");
    }

    const pickle = getPickleApi();
    const bytes = new Uint8Array(logBuffer);

    return new pickle.Parser().parse(bytes);
  }

  function safeDescribe(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return `Array(${value.length})`;
    return typeof value;
  }

  window.renpyPickle = {
    getPickleApi,
    parseLogBuffer,
    safeDescribe
  };
})();