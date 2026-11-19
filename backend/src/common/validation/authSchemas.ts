import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name is required')
    .max(100, 'Full name must not exceed 100 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address'),
  redirectTo: z
    .string()
    .trim()
    .url('Redirect URL must be a valid URL')
    .optional(),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
  tokenHash: z.string().optional(),
});

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Full name cannot be empty')
    .max(100, 'Full name must not exceed 100 characters')
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number format')
    .nullable()
    .optional(),
  avatarUrl: z
    .string()
    .trim()
    .url('Avatar URL must be a valid URL')
    .nullable()
    .optional(),
});
