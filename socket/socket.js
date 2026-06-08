const jwt = require("jsonwebtoken");
const Chat = require("../models/chat.model");
const Message = require("../models/message.model");

module.exports = (io) => {
  const onlineUsers = new Map();

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Auth error! Token required"));
    }

    try {
      const user = jwt.verify(token, process.env.ACCESS_TOKEN_KEY);

      socket.user = user;
      console.log("Socket user:", user);

      next();
    } catch (error) {
      return next(new Error("Auth error! Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.user.username}`);

    socket.emit("userData", socket.user);

    // Track online users (supports multiple tabs/devices)
    if (!onlineUsers.has(socket.user._id)) {
      onlineUsers.set(socket.user._id, new Set());
    }

    onlineUsers.get(socket.user._id).add(socket.id);

    // Join Chat Room
    socket.on("joinRoom", async (chatId) => {
      try {
        const chat = await Chat.findById(chatId);

        if (
          !chat ||
          !chat.participants.some((id) => id.equals(socket.user._id))
        ) {
          return socket.emit("roomError", "Access denied");
        }

        socket.join(chatId);

        const messages = await Message.find({ chatId })
          .populate("sender", "_id username")
          .sort({ createdAt: 1 });

        socket.emit("messageHistory", messages);

        console.log(`User ${socket.user._id} joined room ${chatId}`);
      } catch (error) {
        console.error("Join room error:", error);
        socket.emit("roomError", "Failed to join room");
      }
    });

    // Typing Indicator
    socket.on("typing", ({ chatId }) => {
      socket.to(chatId).emit("showTyping", {
        userId: socket.user._id,
        username: socket.user.username,
      });
    });

    socket.on("stopTyping", ({ chatId }) => {
      socket.to(chatId).emit("hideTyping", {
        userId: socket.user._id,
      });
    });

    // Send Message
    socket.on("sendMessage", async ({ chatId, content }) => {
      try {
        const userId = socket.user._id;

        if (!content?.trim()) {
          return socket.emit(
            "errorInSendMessage",
            "Message content is required",
          );
        }

        const chat = await Chat.findById(chatId);

        if (!chat || !chat.participants.some((id) => id.equals(userId))) {
          return socket.emit("errorInSendMessage", "Access denied");
        }

        const newMessage = await Message.create({
          chatId,
          sender: userId,
          content: content.trim(),
        });

        chat.lastMessage = newMessage._id;
        await chat.save();

        await newMessage.populate("sender", "_id username");

        io.to(chatId).emit("getMessage", newMessage);
      } catch (error) {
        console.error("Send message error:", error);

        socket.emit("errorInSendMessage", "Failed to send message");
      }
    });

    // Disconnect
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.user.username}`);

      const userSockets = onlineUsers.get(socket.user._id);

      if (userSockets) {
        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          onlineUsers.delete(socket.user._id);
        }
      }
    });
  });
};
