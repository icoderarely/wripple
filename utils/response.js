const ok = (res, message, data, status = 200) => {
  const payload = { success: true, message };
  if (data !== undefined) payload.data = data;
  return res.status(status).json(payload);
};

const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

module.exports = { ok, fail };
