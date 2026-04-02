(() => {
  function getPickleApi() {
    if (!window.pickleparser || typeof window.pickleparser.Parser !== "function") {
      throw new Error("pickleparser belum termuat di browser.");
    }
    return window.pickleparser;
  }

  class RenpyRevertableList extends Array {}
  class RenpyRevertableDict {}
  class RenpyRevertableSet extends Array {}

  function makeNameRegistry(pickle) {
    if (typeof pickle.NameRegistry !== "function") {
      return null;
    }

    return new pickle.NameRegistry()
      .register("renpy.revertable", "RevertableList", RenpyRevertableList)
      .register("renpy.python", "RevertableList", RenpyRevertableList)
      .register("renpy.revertable", "RevertableDict", RenpyRevertableDict)
      .register("renpy.python", "RevertableDict", RenpyRevertableDict)
      .register("renpy.revertable", "RevertableSet", RenpyRevertableSet)
      .register("renpy.python", "RevertableSet", RenpyRevertableSet);
  }

  function makeParser() {
    const pickle = getPickleApi();
    const registry = makeNameRegistry(pickle);

    if (!registry) {
      return new pickle.Parser();
    }

    return new pickle.Parser({
      nameResolver: registry,
      unpicklingTypeOfDictionary: "object",
      unpicklingTypeOfSet: "array"
    });
  }

  function parseLogBuffer(logBuffer) {
    if (!(logBuffer instanceof ArrayBuffer)) {
      throw new Error("logBuffer Ren'Py tidak valid.");
    }

    const parser = makeParser();
    const bytes = new Uint8Array(logBuffer);
    return parser.parse(bytes);
  }

  function safeDescribe(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (value instanceof Map) return `Map(${value.size})`;
    if (value instanceof Set) return `Set(${value.size})`;
    if (typeof value === "object") {
      try {
        return value.constructor?.name || "object";
      } catch (_) {
        return "object";
      }
    }
    return typeof value;
  }

  window.renpyPickle = {
    getPickleApi,
    parseLogBuffer,
    safeDescribe
  };
})();