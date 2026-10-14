// Production batch inventory: one vetted shared gateway, no per-service containers.
// Empty manifest is safe without configuration. Nonempty manifest MUST pass signed
// independent evidence verification at startup, or startup fails closed.
import {readFileSync} from 'node:fs';
import {validateActiveManifest} from './factory-batch-engine.mjs';

const manifest=JSON.parse(readFileSync(new URL('./factory-batch-active.json',import.meta.url),'utf8'));
const verifierKey=process.env.FACTORY_ATTESTOR_ED25519_PUBLIC_KEY_PEM_B64||'';
export const activeFactoryIds=Object.freeze(validateActiveManifest(manifest,verifierKey));
