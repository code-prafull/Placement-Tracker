import api from './api';

/** Compile & run C++ on the server. */
export const runCode = (payload) =>
  api.post('/code/run', payload).then((r) => r.data);
