import { ScannedDocumentData } from '@/components/bookings/DocumentScanner'

export function parseCCCDQR(raw: string): ScannedDocumentData | null {
  const parts = raw.split('|')
  if (parts.length < 6) return null

  const idNumber = parts[0]?.trim()
  if (!/^\d{12}$/.test(idNumber)) return null

  const fullName = parts[2]?.trim()
  const dobRaw = parts[3]?.trim()
  const genderRaw = parts[4]?.trim()
  const address = parts[5]?.trim()

  const dob = dobRaw?.length === 8
    ? `${dobRaw.slice(0, 2)}/${dobRaw.slice(2, 4)}/${dobRaw.slice(4)}`
    : dobRaw

  const gender: 'male' | 'female' | undefined =
    genderRaw === 'Nam' ? 'male' : genderRaw === 'Nữ' ? 'female' : undefined

  return {
    full_name: fullName,
    id_number: idNumber,
    date_of_birth: dob,
    gender,
    nationality: 'Việt Nam',
    address,
  }
}
