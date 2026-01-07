import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const API_URL = 'http://localhost:3000';

export const handlers = [
  // Default handlers - can be overridden in tests
  http.get(`${API_URL}/api/tasks`, () => {
    return HttpResponse.json([]);
  }),
];

export const server = setupServer(...handlers);

// Helper to mock specific endpoints
export function mockApiResponse(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  data: any,
  status = 200
) {
  const httpMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
  const handler = http[httpMethod](
    `${API_URL}${path}`,
    () => {
      return HttpResponse.json(data, { status });
    }
  );
  server.use(handler);
}
