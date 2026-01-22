type Env = {
  WORKER_URL: string;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const workerUrl = context.env.WORKER_URL || 'https://coderoom-worker.pfung5423.workers.dev';
  const targetUrl = `${workerUrl}${url.pathname}${url.search}`;

  return fetch(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  });
};
