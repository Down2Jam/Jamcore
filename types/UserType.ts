export interface UserType {
  id: number;
  slug: string;
  name: string;
  profilePicture: string;
  createdAt: Date;
  mod: boolean;
  admin: boolean;
  twitch?: string | null;
  hideRatings?: boolean;
  autoHideRatingsWhileStreaming?: boolean;
}
