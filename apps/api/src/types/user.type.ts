export type SafeUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isVerified: boolean;
  createdAt: Date;
};

export const toSafeUser = (user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isVerified: boolean;
  createdAt: Date;
  passwordHash?: string | null;
}): SafeUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
});
