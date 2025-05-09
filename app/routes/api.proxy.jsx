import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Get the form data from the request
    const requestBody = await request.json();

    // This endpoint requires certain parameters
    if (!requestBody || !requestBody.endpoint || !requestBody.method) {
      return json({
        success: false,
        error: "Missing required parameters. Please provide 'endpoint' and 'method'."
      }, { status: 400 });
    }

    // Extract params
    const { endpoint, method, data, headers: customHeaders = {} } = requestBody;

    // Add shop domain and access token to the data
    const enhancedData = {
      ...data,
      shopDomain: session.shop,
      accessToken: session.accessToken
    };

    console.log(`Proxy request to ${endpoint} with method ${method}`);

    // Set up headers
    const headers = {
      "Content-Type": "application/json",
      ...customHeaders
    };

    // Set up fetch options
    const fetchOptions = {
      method: method,
      headers: headers
    };

    // Add body for non-GET requests
    if (method !== "GET") {
      fetchOptions.body = JSON.stringify(enhancedData);
    }

    // Make the request to the external endpoint
    const response = await fetch(endpoint, fetchOptions);

    // Get response status
    const status = response.status;

    // Get the response text first to ensure we have it for error handling
    const responseText = await response.text();

    // Try to parse as JSON if possible
    let responseData;
    try {
      if (responseText && responseText.trim()) {
        responseData = JSON.parse(responseText);
      } else {
        responseData = { message: "Empty response" };
      }
    } catch (e) {
      // Not valid JSON
      console.log("Response is not valid JSON:", responseText.substring(0, 500));
      responseData = {
        message: "Non-JSON response",
        rawResponse: responseText.substring(0, 1000)
      };
    }

    // Return response data regardless of status code
    // This allows the client to handle HTTP errors properly
    return json({
      success: response.ok,
      data: responseData,
      status: status,
      statusText: response.statusText,
    }, { status: 200 }); // Always return 200 to client so we can handle API errors in our UI

  } catch (error) {
    console.error("Proxy error:", error);
    return json({
      success: false,
      error: `Proxy error: ${error.message}`
    }, { status: 500 });
  }
}

// For handling preflight requests
export async function loader({ request }) {
  return json({
    success: true,
    message: "API proxy endpoint is available. Use POST method to make proxy requests."
  });
}