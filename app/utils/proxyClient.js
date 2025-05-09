/**
 * ProxyClient - A utility for making API requests through the app proxy
 * to avoid CORS issues with external services
 */

/**
 * Make a request through the proxy
 * @param {string} endpoint - The external API endpoint URL
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object} data - Data to send in the request
 * @param {Object} headers - Custom headers to include
 * @param {boolean} throwOnHttpError - Whether to throw error on non-2xx response (default: true)
 * @returns {Promise<Object>} - Response from the proxy
 */
export async function proxyRequest(endpoint, method = "GET", data = null, headers = {}, throwOnHttpError = true) {
  try {
    console.log(`Making ${method} proxy request to ${endpoint}`);

    const response = await fetch("/api/proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint,
        method,
        data,
        headers,
      }),
    });

    // Handle errors from the proxy endpoint itself
    if (!response.ok) {
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || `Proxy error: ${response.status}`;
      } catch (e) {
        errorMessage = `Proxy error: ${response.status}`;
      }
      throw new Error(errorMessage);
    }

    // Parse the proxy response
    const result = await response.json();

    // Check if the proxied external request was successful
    if (!result.success && throwOnHttpError) {
      // Format a more detailed error message
      let errorMessage = `External API error: ${result.status || 'Unknown'}`;

      if (result.data && typeof result.data === 'object') {
        if (result.data.error) {
          errorMessage += ` - ${result.data.error}`;
        } else if (result.data.errors) {
          const errors = result.data.errors;
          if (typeof errors === 'string') {
            errorMessage += ` - ${errors}`;
          } else if (Array.isArray(errors)) {
            errorMessage += ` - ${errors.join(', ')}`;
          } else if (typeof errors === 'object') {
            errorMessage += ` - ${JSON.stringify(errors)}`;
          }
        } else if (result.data.message) {
          errorMessage += ` - ${result.data.message}`;
        }
      }

      console.error("API request failed:", errorMessage, result);
      throw new Error(errorMessage);
    }

    return result.data;
  } catch (error) {
    console.error("Proxy request failed:", error);
    throw error;
  }
}

/**
 * Convenience method for GET requests
 * @param {string} endpoint - The external API endpoint URL
 * @param {Object} headers - Custom headers to include
 * @param {boolean} throwOnHttpError - Whether to throw error on non-2xx response
 * @returns {Promise<Object>} - Response from the proxy
 */
export function proxyGet(endpoint, headers = {}, throwOnHttpError = true) {
  return proxyRequest(endpoint, "GET", null, headers, throwOnHttpError);
}

/**
 * Convenience method for POST requests
 * @param {string} endpoint - The external API endpoint URL
 * @param {Object} data - Data to send in the request
 * @param {Object} headers - Custom headers to include
 * @param {boolean} throwOnHttpError - Whether to throw error on non-2xx response
 * @returns {Promise<Object>} - Response from the proxy
 */
export function proxyPost(endpoint, data, headers = {}, throwOnHttpError = true) {
  return proxyRequest(endpoint, "POST", data, headers, throwOnHttpError);
}

/**
 * Convenience method for PUT requests
 * @param {string} endpoint - The external API endpoint URL
 * @param {Object} data - Data to send in the request
 * @param {Object} headers - Custom headers to include
 * @param {boolean} throwOnHttpError - Whether to throw error on non-2xx response
 * @returns {Promise<Object>} - Response from the proxy
 */
export function proxyPut(endpoint, data, headers = {}, throwOnHttpError = true) {
  return proxyRequest(endpoint, "PUT", data, headers, throwOnHttpError);
}

/**
 * Convenience method for DELETE requests
 * @param {string} endpoint - The external API endpoint URL
 * @param {Object} data - Optional data to send in the request
 * @param {Object} headers - Custom headers to include
 * @param {boolean} throwOnHttpError - Whether to throw error on non-2xx response
 * @returns {Promise<Object>} - Response from the proxy
 */
export function proxyDelete(endpoint, data = null, headers = {}, throwOnHttpError = true) {
  return proxyRequest(endpoint, "DELETE", data, headers, throwOnHttpError);
}