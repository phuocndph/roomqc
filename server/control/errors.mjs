export class ControlError extends Error {
  constructor(status,code,message){super(message);this.status=status;this.code=code}
}
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
