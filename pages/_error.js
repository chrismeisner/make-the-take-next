import React from 'react';

function ErrorPage({ statusCode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        {statusCode ? (
          <p className="text-gray-700">An error {statusCode} occurred.</p>
        ) : (
          <p className="text-gray-700">An error occurred on the client.</p>
        )}
      </div>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;


