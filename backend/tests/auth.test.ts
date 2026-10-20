import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';

describe('Phase 2 — Authentication, Customer Accounts & Admin Authorization', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Registration (/api/v1/auth/register)', () => {
    it('successfully registers customer and assigns default customer role', async () => {
      const mockSignUp = vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-uuid-1',
            email: 'customer@example.com',
            email_confirmed_at: '2026-10-19T00:00:00.000Z',
          },
          session: {
            access_token: 'mock-access-token-1',
            refresh_token: 'mock-refresh-token-1',
            expires_in: 3600,
          },
        },
        error: null,
      });

      const mockAdminUpsert = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: { signUp: mockSignUp },
      } as any);
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({ upsert: mockAdminUpsert }),
      } as any);

      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'Customer@example.com',
        password: 'Password123!',
        fullName: 'Jane Doe',
        phone: '+919876543210',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('customer@example.com');
      expect(res.body.data.session.accessToken).toBe('mock-access-token-1');
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'customer@example.com',
        password: 'Password123!',
        options: {
          data: {
            full_name: 'Jane Doe',
            phone: '+919876543210',
          },
        },
      });
    });

    it('rejects invalid registration payload (short password, invalid email)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'not-an-email',
        password: 'short',
        fullName: '',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles duplicate registration from Supabase Auth gracefully', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'User already registered' },
          }),
        },
      } as any);

      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        fullName: 'Jane Doe',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('User already registered');
    });

    it('prevents public signup from passing admin role or metadata tampering', async () => {
      const mockSignUp = vi.fn().mockResolvedValue({
        data: {
          user: { id: 'user-uuid-2', email: 'attacker@example.com' },
          session: null,
        },
        error: null,
      });

      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: { signUp: mockSignUp },
      } as any);
      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(null);

      await request(app).post('/api/v1/auth/register').send({
        email: 'attacker@example.com',
        password: 'Password123!',
        fullName: 'Malicious Actor',
        role: 'admin', // attacker tries to inject role
      });

      // Role is ignored by schema and never passed to Supabase
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'attacker@example.com',
        password: 'Password123!',
        options: {
          data: {
            full_name: 'Malicious Actor',
            phone: null,
          },
        },
      });
    });
  });

  describe('2. Login (/api/v1/auth/login)', () => {
    it('authenticates user and returns session and profile', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'user-uuid-1', email: 'customer@example.com' },
              session: {
                access_token: 'valid-access-token',
                refresh_token: 'valid-refresh-token',
                expires_at: 1770000000,
                expires_in: 3600,
              },
            },
            error: null,
          }),
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'user-uuid-1',
                  role: 'customer',
                  full_name: 'Jane Doe',
                  phone: null,
                  avatar_url: null,
                  created_at: '2026-10-19T00:00:00.000Z',
                  updated_at: '2026-10-19T00:00:00.000Z',
                },
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'customer@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.session.accessToken).toBe('valid-access-token');
    });

    it('rejects invalid credentials with 401 Unauthorized', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials' },
          }),
        },
      } as any);

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'wrong@example.com',
        password: 'WrongPassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('3. Session Validation & Current User (/api/v1/auth/me)', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when token is expired or invalid in Supabase', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Token expired' },
          }),
        },
      } as any);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer expired-token');

      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain('Token expired');
    });

    it('retrieves user profile and role when token is valid', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-uuid-1', email: 'jane@example.com' } },
            error: null,
          }),
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'user-uuid-1',
                  role: 'customer',
                  full_name: 'Jane Doe',
                  phone: '+919876543210',
                  avatar_url: null,
                  created_at: '2026-10-19T00:00:00Z',
                  updated_at: '2026-10-19T00:00:00Z',
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-token-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.user.profile.full_name).toBe('Jane Doe');
    });
  });

  describe('4. Logout & Password Recovery', () => {
    it('POST /api/v1/auth/logout successfully signs out authenticated user', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      const mockSignOut = vi.fn().mockResolvedValue({ error: null });
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1', email: 'test@example.com' } },
          }),
          signOut: mockSignOut,
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'user-1', role: 'customer', full_name: 'Test' },
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/v1/auth/forgot-password sends generic success message without leaking existence', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
      } as any);

      const res = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'anyone@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If the email is registered');
    });

    it('POST /api/v1/auth/reset-password updates password for authenticated user', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      const mockUpdateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1', email: 'test@example.com' } },
          }),
          updateUser: mockUpdateUser,
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'user-1', role: 'customer', full_name: 'Test' },
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .set('Authorization', 'Bearer valid-token')
        .send({ password: 'NewSecurePassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewSecurePassword123!' });
    });
  });

  describe('5. Customer Profile Management (/api/v1/customers/me)', () => {
    it('GET /api/v1/customers/me returns current user profile', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1', email: 'customer@example.com' } },
          }),
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'user-1',
                  role: 'customer',
                  full_name: 'Customer Name',
                  phone: null,
                  avatar_url: null,
                  created_at: '2026-10-19T00:00:00Z',
                  updated_at: '2026-10-19T00:00:00Z',
                },
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get('/api/v1/customers/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.profile.full_name).toBe('Customer Name');
    });

    it('PATCH /api/v1/customers/me updates allowed profile fields', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1', email: 'customer@example.com' } },
          }),
        },
      } as any);

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-1',
                role: 'customer',
                full_name: 'Updated Name',
                phone: '+919999988888',
                avatar_url: null,
                created_at: '2026-10-19T00:00:00Z',
                updated_at: '2026-10-19T01:00:00Z',
              },
              error: null,
            }),
          }),
        }),
      });

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'user-1', role: 'customer', full_name: 'Old Name' },
                  }),
                }),
              }),
              update: mockUpdate,
            };
          }
          return {} as any;
        },
      } as any);

      const res = await request(app)
        .patch('/api/v1/customers/me')
        .set('Authorization', 'Bearer valid-token')
        .send({
          fullName: 'Updated Name',
          phone: '+919999988888',
          role: 'admin', // Malicious attempt to change role
        });

      expect(res.status).toBe(200);
      expect(res.body.data.profile.full_name).toBe('Updated Name');
      // Verify mockUpdate payload strictly excluded role
      const updateArgs = mockUpdate.mock.calls[0][0];
      expect(updateArgs.role).toBeUndefined();
      expect(updateArgs.full_name).toBe('Updated Name');
    });
  });

  describe('6. Admin Authorization (/api/v1/admin/verify)', () => {
    it('allows access to user with admin role', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@hindustanhardware.com' } },
          }),
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'admin-1',
                  role: 'admin',
                  full_name: 'Store Admin',
                  phone: null,
                  avatar_url: null,
                  created_at: '2026-10-19T00:00:00Z',
                  updated_at: '2026-10-19T00:00:00Z',
                },
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get('/api/v1/admin/verify')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('admin');
    });

    it('forbids access (403 Forbidden) to ordinary customer user', async () => {
      vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
      vi.spyOn(supabaseConfig, 'getSupabaseClient').mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'cust-1', email: 'cust@example.com' } },
          }),
        },
      } as any);

      vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'cust-1',
                  role: 'customer',
                  full_name: 'Regular Customer',
                },
              }),
            }),
          }),
        }),
      } as any);

      const res = await request(app)
        .get('/api/v1/admin/verify')
        .set('Authorization', 'Bearer customer-token');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
