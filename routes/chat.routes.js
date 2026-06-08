const router = require("express").Router();

const { ok, fail } = require("../utils/response");
const authMiddleware = require("../middlewares/auth.middleware");
const Chat = require("../models/chat.model");
const Message = require("../models/message.model");
const { default: z } = require("zod");

router.get("/", authMiddleware, async (req, res) => {
  const userId = req.user._id;

  const chats = await Chat.find({ participants: userId })
    .populate("participants", "_id username")
    // .populate("lastMessage", "sender content createdAt")
    // .populate("lastMessage.sender", "username");
    .populate({
      path: "lastMessage",
      select: "sender content createdAt",
      populate: {
        path: "sender",
        select: "username",
      },
    })
    .sort({ updatedAt: -1 });

  return ok(res, "Chats fetched", { chats });
});

router.get("/:chatId/messages", authMiddleware, async (req, res) => {
  const chatId = req.params.chatId;

  const paginationSchema = z.object({
    limit: z.coerce.number().min(1).max(100).default(2),
    page: z.coerce.number().min(1).default(1),
  });

  const { page, limit } = paginationSchema.parse(req.query);

  const messages = await Message.find({ chatId })
    .populate("sender", "_id username")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const hasPrevMsgs = messages.length === limit ? true : false;

  return ok(res, "Messages", { messages, hasPrevMsgs, page, limit });
});

router.post("/create-chat", authMiddleware, async (req, res) => {
  const userId = req.user._id;
  const receiverId = req.body["receiver-id"];

  if (!receiverId) return fail(res, 400, "Receiver required");

  let chat = await Chat.findOne({
    participants: { $all: [userId, receiverId], $size: 2 },
  });

  if (!chat) {
    chat = new Chat({
      participants: [userId, receiverId],
    });
    await chat.save();
  }

  return ok(res, null, { chat }, 201);
});

router.post("/send-messages", authMiddleware, async (req, res) => {
  const userId = req.user._id;
  // const chatId = req.params.chatId;
  const content = req.body.content;
  const chatId = req.body["chat-id"];

  if (!content) return fail(res, 400, "Content(msg-txt) is required");

  const chat = await Chat.findById(chatId);

  if (!chat || !chat.participants.some((id) => id.equals(userId))) {
    return fail(res, 403, "Access denied!");
  }

  const newMessage = new Message({
    chatId: chat._id,
    sender: userId,
    content,
  });

  await newMessage.save();

  chat.lastMessage = newMessage._id;
  await chat.save();

  await newMessage.populate("sender", "_id username");

  return ok(res, null, { newMessage }, 201);
});

module.exports = router;
