/* ============================================================
   Ketor -- Tasks Registry
   ------------------------------------------------------------
   Lightweight observable task registry (non-React) that
   complements the React task state in WorkbenchContext.
   Useful for code outside React (workers, command handlers)
   to report task start/progress/done without prop drilling.

   API:
   - startTask({ id, label, detail }) -> id
   - updateTask(id, { progress, detail, status })
   - finishTask(id, status, detail)
   - onDidChange(fn) -> unsubscribe
   - getTasks() / getTask(id)
   - getSummary() -> { running, done, failed, total }
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.tasks = Ketor.tasks || {};

  var tasks = new Map();
  var listeners = new Set();

  function notify() {
    var snapshot = Array.from(tasks.values());
    listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (_) { }
    });
  }

  function genId() {
    return 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  }

  function startTask(input) {
    var task = input || {};
    var id = task.id || genId();
    tasks.set(id, {
      id: id,
      label: task.label || 'Task',
      detail: task.detail || '',
      progress: Number(task.progress) || 0,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null
    });
    notify();
    return id;
  }

  function updateTask(id, patch) {
    var t = tasks.get(id);
    if (!t) return false;
    var next = Object.assign({}, t, patch || {});
    tasks.set(id, next);
    notify();
    return true;
  }

  function finishTask(id, status, detail) {
    var t = tasks.get(id);
    if (!t) return false;
    tasks.set(id, Object.assign({}, t, {
      status: status || 'done',
      progress: 100,
      detail: detail != null ? detail : t.detail,
      finishedAt: Date.now()
    }));
    notify();
    return true;
  }

  function getTask(id) {
    return tasks.get(id) || null;
  }

  function getTasks() {
    return Array.from(tasks.values());
  }

  function getSummary() {
    var running = 0, done = 0, failed = 0;
    tasks.forEach(function (t) {
      if (t.status === 'running') running++;
      else if (t.status === 'failed') failed++;
      else done++;
    });
    return { running: running, done: done, failed: failed, total: tasks.size };
  }

  function clearFinished() {
    tasks.forEach(function (t, id) {
      if (t.status !== 'running') tasks.delete(id);
    });
    notify();
  }

  function onDidChange(fn) {
    if (typeof fn !== 'function') return function () { };
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  Ketor.tasks.startTask = startTask;
  Ketor.tasks.updateTask = updateTask;
  Ketor.tasks.finishTask = finishTask;
  Ketor.tasks.getTask = getTask;
  Ketor.tasks.getTasks = getTasks;
  Ketor.tasks.getSummary = getSummary;
  Ketor.tasks.clearFinished = clearFinished;
  Ketor.tasks.onDidChange = onDidChange;

})(window);