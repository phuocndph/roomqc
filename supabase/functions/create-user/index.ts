import { handleStaffInvitations } from '../_shared/email/staff-invitations.ts'
Deno.serve(req => handleStaffInvitations(req, 'create'))
