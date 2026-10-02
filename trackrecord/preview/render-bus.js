// Late-bound render callbacks used to break circular imports between
// view modules. main.js installs the real implementations during init().

const handlers = {
  mainView: () => {},
  myList: () => {},
  database: () => {},
};

export function setRenderHandlers(next) {
  for (const key of Object.keys(handlers)) {
    if (typeof next[key] === 'function') handlers[key] = next[key];
  }
}

export function renderMainView() { handlers.mainView(); }
export function renderMyList() { handlers.myList(); }
export function renderDatabase() { handlers.database(); }