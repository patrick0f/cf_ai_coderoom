export interface Env {
  // Bindings will be added as we build:
  // ROOM_STATE: DurableObjectNamespace;
  // AI: Ai;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Health check endpoint
    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        phase: 0,
      })
    }

    // 404 for unknown routes
    return Response.json(
      { error: 'Not found' },
      { status: 404 }
    )
  },
}
