// This is a Vercel Serverless Function.
// It acts as a secure proxy to the finnhub.io service for stock quotes.

export default async function handler(request, response) {
  // We only allow GET requests to this function.
  if (request.method !== 'GET') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  // Get the Ticker symbol from the URL (e.g., /api/finnhub?ticker=AAPL)
  const { ticker } = request.query;

  if (!ticker) {
    return response.status(400).json({ message: 'Ticker symbol is required.' });
  }

  // Get the Finnhub API key securely from Vercel's environment variables.
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    // If the key is missing on the server, return an error.
    return response.status(500).json({ message: 'Finnhub API key is not configured on the server.' });
  }

  try {
    // Construct the correct Finnhub API URL.
    const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`;
    
    // Make the actual call to finnhub.io from Vercel's server.
    const apiResponse = await fetch(finnhubUrl);

    // If the finnhub.io call fails, pass that error back.
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return response.status(apiResponse.status).json({ message: `Failed to fetch from Finnhub: ${errorText}` });
    }

    // If the call was successful, get the JSON data.
    const data = await apiResponse.json();
    
    // Send the data back to the user's browser.
    return response.status(200).json(data);

  } catch (error) {
    // Catch any other unexpected errors.
    return response.status(500).json({ message: `An internal server error occurred: ${error.message}` });
  }
}