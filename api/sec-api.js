// This is a Vercel Serverless Function.
// It acts as a secure proxy to the sec-api.io service.

export default async function handler(request, response) {
  // We only allow POST requests to this function.
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Get the API key securely from Vercel's environment variables.
  // It is never exposed to the user's browser.
  const apiKey = process.env.SEC_API_KEY;

  if (!apiKey) {
    // If the key is missing on the server, return an error.
    response.status(500).json({ error: 'API key is not configured on the server.' });
    return;
  }

  try {
    // Get the query payload that the user's browser sent to us.
    const payload = request.body;

    // Make the actual call to the sec-api.io from Vercel's server.
    const apiResponse = await fetch('https://api.sec-api.io', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // We add the secret key here, on the server.
        'Authorization': apiKey, 
      },
      body: JSON.stringify(payload),
    });

    // If the sec-api.io call fails, pass that error back.
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      response.status(apiResponse.status).json({ error: `Failed to fetch from sec-api.io: ${errorText}` });
      return;
    }

    // If the call was successful, get the JSON data.
    const data = await apiResponse.json();

    // Send the data back to the user's browser.
    response.status(200).json(data);

  } catch (error) {
    // Catch any other unexpected errors.
    response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
  }
}