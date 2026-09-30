export async function submitFreeDirectoryListing(origin) {
  const response = await fetch('https://true402.dev/api/v1/services', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json'
    },
    body: JSON.stringify({ url: origin })
  });
  const body = await response.text();
  return {
    httpStatus: response.status,
    ok: response.ok,
    location: response.headers.get('location'),
    body: body.slice(0, 10000),
    completedAt: new Date().toISOString()
  };
}
