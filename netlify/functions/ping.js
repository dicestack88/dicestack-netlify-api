exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "https://dicestack88.github.io"
    },
    body: JSON.stringify({
      success: true,
      message: "Netlify Functions are working!"
    })
  };
};
