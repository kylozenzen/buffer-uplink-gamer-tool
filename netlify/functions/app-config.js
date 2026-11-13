'use strict';

// app-config.js — public settings the browser needs, read from Netlify environment
// variables so nothing is hard-coded. Only public values are returned (never secrets).
//   BUFFER_CLIENT_ID → turns on "Sign in with Buffer"

exports.handler = async function handler() {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    body: JSON.stringify({ bufferClientId: (process.env.BUFFER_CLIENT_ID || '').trim() }),
  };
};
