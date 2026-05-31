const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, data: "authorization token required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedUser = jwt.verify(token, process.env.ACCESS_TOKEN_KEY);
    req.user = decodedUser;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, data: "invalid token" });
  }
};

module.exports = authMiddleware;
