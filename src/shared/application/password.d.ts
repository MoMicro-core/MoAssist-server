export function hashPassword(password: string): {
  passwordHash: string;
  passwordSalt: string;
};

export function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
): boolean;
