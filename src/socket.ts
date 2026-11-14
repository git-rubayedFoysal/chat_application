import { Server } from "socket.io";

let io: Server | null = null;

/**
 * Creates the Socket.io server and attaches relay handlers.
 *
 * A factory (rather than a module-level instance) lets `index.ts` create the
 * HTTP server first, avoiding a circular dependency with controllers.
 *
 * @param server - The HTTP server to bind Socket.io to.
 */
export const initIo = (server: any) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("join_conversation", (conversationId) => {
      if (!conversationId) return;

      // Leave all other rooms so a client only receives events for the
      // conversation currently on screen; otherwise stale rooms keep
      // delivering events from previously opened chats.
      for (const room of socket.rooms) {
        if (room !== socket.id) socket.leave(room);
      }

      socket.join(conversationId);
      console.log(`User ${socket.id} joined room: ${conversationId}`);
    });

    // Relay typing signals with socket.to(...) so the sender never
    // receives their own indicator.
    socket.on("typing", (data) => {
      const { conversationId, senderId, senderName } = data;
      if (!conversationId) return;
      socket.to(conversationId).emit("typing", {
        conversationId,
        userId: senderId,
        userName: senderName,
      });
    });

    socket.on("stop-typing", (data) => {
      const { conversationId, senderId, senderName } = data;
      if (!conversationId) return;
      socket.to(conversationId).emit("stop-typing", {
        conversationId,
        userId: senderId,
        userName: senderName,
      });
    });

    socket.on("disconnect", () => {
      console.log("A user disconnected:", socket.id);
    });
  });
};

/**
 * Returns the shared Socket.io instance used by controllers to emit events.
 *
 * @returns The initialized Socket.io server.
 * @throws {Error} If called before `initIo`.
 */
export const getIo = (): Server => {
  if (!io) {
    throw new Error("Socket.io has not been initialized. Call initIo first.");
  }
  return io;
};
