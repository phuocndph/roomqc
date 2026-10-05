import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
})

const publicJwk = publicKey.export({ format: 'jwk' })
const privateJwk = privateKey.export({ format: 'jwk' })

if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  throw new Error('Could not export the generated P-256 key pair')
}

const rawPublicKey = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(publicJwk.x, 'base64url'),
  Buffer.from(publicJwk.y, 'base64url'),
])

console.log(`VITE_VAPID_PUBLIC_KEY=${rawPublicKey.toString('base64url')}`)
console.log(`VAPID_PUBLIC_KEY=${rawPublicKey.toString('base64url')}`)
console.log(`VAPID_PRIVATE_KEY=${Buffer.from(privateJwk.d, 'base64url').toString('base64url')}`)
