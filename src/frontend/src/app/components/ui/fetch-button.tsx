import React, { useState } from "react";

const FetchButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      const res = await fetch("http://localhost:8080/todos"); // backend URL
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.text(); // or .json() if backend returns JSON
      setResponse(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleClick}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        disabled={loading}
      >
        {loading ? "Loading..." : "Call Backend"}
      </button>

      {response && <p className="text-green-600">Response: {response}</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
    </div>
  );
};

export default FetchButton;
