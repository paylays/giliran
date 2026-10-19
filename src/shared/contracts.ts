import { z } from 'zod';

const id = z.number().int().positive();
const name = z.string().trim().min(1).max(80);

// ---- Auth ----

export const loginBody = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginBody = z.infer<typeof loginBody>;

// ---- Visitor ----

// knownTokens: every ticket token this browser still stores. The server refuses a new ticket when
// one of them is an active (waiting or called) ticket of the same service today.
export const takeTicketBody = z.object({
  serviceId: id,
  knownTokens: z.array(z.string().max(64)).max(20).default([]),
});
export type TakeTicketBody = z.infer<typeof takeTicketBody>;

export interface TakeTicketResponse {
  token: string;
  number: string;
}

// 409 body when the browser already holds an active ticket for the service.
export interface AlreadyActiveResponse extends TakeTicketResponse {
  error: 'already_active';
}

// ---- Staff ----

export const selectCounterBody = z.object({ counterId: id });
export type SelectCounterBody = z.infer<typeof selectCounterBody>;

// A null expected id means the client believes no ticket is current; a stale value returns 409.
export const callNextBody = z.object({ expectedCurrentTicketId: id.nullable() });
export type CallNextBody = z.infer<typeof callNextBody>;

export const ticketActionBody = z.object({ ticketId: id });
export type TicketActionBody = z.infer<typeof ticketActionBody>;

// ---- Admin: settings ----

export const timeZoneName = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Unknown time zone' },
);

export const wifiSecurities = ['WPA', 'WEP', 'nopass'] as const;
export type WifiSecurity = (typeof wifiSecurities)[number];

export const updateSettingsBody = z.object({
  businessName: name,
  timezone: timeZoneName,
  nearThreshold: z.number().int().min(1).max(20),
  // Omitted wifi fields keep their stored value; null clears.
  wifiSsid: z.string().min(1).max(32).nullable().optional(),
  wifiPassword: z.string().min(1).max(63).nullable().optional(),
  wifiSecurity: z.enum(wifiSecurities).optional(),
});
export type UpdateSettingsBody = z.infer<typeof updateSettingsBody>;

// ---- Admin: services ----

const servicePrefix = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{1,3}$/, 'Prefix is 1-3 letters'));

const numberWidth = z.number().int().min(1).max(6);

export const createServiceBody = z.object({
  name,
  prefix: servicePrefix,
  numberWidth: numberWidth.default(3),
  sortOrder: z.number().int().default(0),
});
export type CreateServiceBody = z.infer<typeof createServiceBody>;

// Spelled out instead of partial(): partial() would re-apply the create defaults to omitted fields.
export const updateServiceBody = z.object({
  name: name.optional(),
  prefix: servicePrefix.optional(),
  numberWidth: numberWidth.optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type UpdateServiceBody = z.infer<typeof updateServiceBody>;

// ---- Admin: counters ----

export const createCounterBody = z.object({
  name,
  sortOrder: z.number().int().default(0),
  serviceIds: z.array(id).default([]),
});
export type CreateCounterBody = z.infer<typeof createCounterBody>;

export const updateCounterBody = z.object({
  name: name.optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  serviceIds: z.array(id).optional(),
});
export type UpdateCounterBody = z.infer<typeof updateCounterBody>;

// ---- Admin: staff accounts ----

const password = z.string().min(8).max(256);

export const createUserBody = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().regex(/^[a-z0-9._-]{3,32}$/, 'Username is 3-32 characters: a-z, 0-9, . _ -')),
  displayName: name,
  password,
  role: z.enum(['admin', 'staff']).default('staff'),
});
export type CreateUserBody = z.infer<typeof createUserBody>;

export const updateUserBody = z.object({
  displayName: name.optional(),
  active: z.boolean().optional(),
});
export type UpdateUserBody = z.infer<typeof updateUserBody>;

export const resetPasswordBody = z.object({ password });
export type ResetPasswordBody = z.infer<typeof resetPasswordBody>;

// ---- API response shapes ----

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'staff';
}

export interface SettingsDto {
  businessName: string;
  timezone: string;
  nearThreshold: number;
  wifiSsid: string | null;
  wifiPassword: string | null;
  wifiSecurity: WifiSecurity;
}

export interface ServiceDto {
  id: number;
  name: string;
  prefix: string;
  numberWidth: number;
  active: boolean;
  sortOrder: number;
}

export interface CounterDto {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
  serviceIds: number[];
}

export interface UserDto extends AuthUser {
  active: boolean;
  createdAt: number;
}

export interface PublicServicesResponse {
  businessName: string;
  services: { id: number; name: string; prefix: string }[];
}

// ---- Snapshots ----
// Each stream sends the whole view state on every message; serverTime is epoch ms.

export interface DisplayCounter {
  id: number;
  name: string;
  current: { ticketId: number; number: string; callCount: number } | null;
}

export interface CallEntry {
  // `${ticketId}:${callCount}`; a recall produces a new id.
  callId: string;
  number: string;
  counterName: string;
  calledAt: number;
}

export interface ServiceWaiting {
  serviceId: number;
  name: string;
  prefix: string;
  waiting: number;
}

export interface DisplaySnapshot {
  serverTime: number;
  businessName: string;
  wifiSsid: string | null;
  /** Changes whenever settings are saved; append to the Wi-Fi QR URL so a new password shows at once. */
  wifiQrVersion: number | null;
  counters: DisplayCounter[];
  recentCalls: CallEntry[];
  services: ServiceWaiting[];
}

interface TicketBase {
  serverTime: number;
  businessName: string;
}

export type TicketSnapshot =
  | (TicketBase & { state: 'not_found' })
  | (TicketBase & { state: 'expired'; number: string; serviceName: string })
  | (TicketBase & {
      state: 'waiting';
      number: string;
      serviceName: string;
      // People ahead in the same service today.
      position: number;
      near: boolean;
    })
  | (TicketBase & {
      state: 'called';
      number: string;
      serviceName: string;
      callId: string;
      counterName: string;
      calledAt: number;
    })
  | (TicketBase & { state: 'done'; number: string; serviceName: string })
  | (TicketBase & { state: 'skipped'; number: string; serviceName: string });

export interface StaffTicket {
  id: number;
  number: string;
  serviceName: string;
  callCount: number;
  calledAt: number | null;
}

export interface StaffSnapshot {
  serverTime: number;
  user: { id: number; displayName: string; role: 'admin' | 'staff' };
  // null until the staff member picks a counter.
  counter: { id: number; name: string } | null;
  // Counters the user may pick from, with the services each handles.
  counterOptions: { id: number; name: string; serviceNames: string[] }[];
  current: StaffTicket | null;
  nextWaiting: Omit<StaffTicket, 'callCount' | 'calledAt'> | null;
  waiting: ServiceWaiting[];
}
