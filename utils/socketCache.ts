// Socket caching utilities for improved performance
import { onlineUsers, userSockets } from "../socket";

interface CachedUserInfo {
  id: string;
  fullName: string;
  email: string;
  image?: string;
  connectedAt: Date;
  lastActivity: Date;
}

class SocketCache {
  private userCache: Map<string, CachedUserInfo> = new Map();
  private conversationCache: Map<string, Set<string>> = new Map();
  private typingCache: Map<string, Map<string, NodeJS.Timeout>> = new Map();

  // Cache user information
  cacheUser(userId: string, userInfo: Omit<CachedUserInfo, 'lastActivity'>) {
    this.userCache.set(userId, {
      ...userInfo,
      lastActivity: new Date()
    });
  }

  // Get cached user info
  getCachedUser(userId: string): CachedUserInfo | undefined {
    return this.userCache.get(userId);
  }

  // Remove user from cache
  removeUser(userId: string) {
    this.userCache.delete(userId);
    this.clearUserFromConversations(userId);
  }

  // Cache conversation participants
  cacheConversation(conversationId: string, userIds: string[]) {
    this.conversationCache.set(conversationId, new Set(userIds));
  }

  // Get conversation participants
  getConversationUsers(conversationId: string): string[] {
    const users = this.conversationCache.get(conversationId);
    return users ? Array.from(users) : [];
  }

  // Clear user from all conversations
  private clearUserFromConversations(userId: string) {
    for (const [conversationId, users] of this.conversationCache.entries()) {
      users.delete(userId);
      if (users.size === 0) {
        this.conversationCache.delete(conversationId);
      }
    }
  }

  // Get online users efficiently
  getOnlineUserIds(): string[] {
    return Object.keys(onlineUsers);
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    return !!onlineUsers[userId];
  }

  // Get socket ID for user
  getUserSocketId(userId: string): string | undefined {
    return userSockets[userId];
  }

  // Batch check online status
  batchCheckOnlineStatus(userIds: string[]): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const userId of userIds) {
      result[userId] = this.isUserOnline(userId);
    }
    return result;
  }

  // Clean expired cache entries
  cleanExpiredEntries(maxAge: number = 300000) { // 5 minutes default
    const now = new Date();
    for (const [userId, userInfo] of this.userCache.entries()) {
      if (now.getTime() - userInfo.lastActivity.getTime() > maxAge) {
        this.userCache.delete(userId);
      }
    }
  }

  // Get cache statistics
  getCacheStats() {
    return {
      userCacheSize: this.userCache.size,
      conversationCacheSize: this.conversationCache.size,
      onlineUsersCount: this.getOnlineUserIds().length
    };
  }
}

export const socketCache = new SocketCache();

// Clean cache every 5 minutes
setInterval(() => {
  socketCache.cleanExpiredEntries();
}, 300000);