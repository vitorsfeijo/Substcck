import type { VerifiedIdentity } from '../models/auth.js';

/** Fixed, explicitly simulated identities. The controller must gate this adapter. */
export const developmentPersonas = {
  author: {
    issuer: 'urn:subtccstack:development',
    subject: 'author',
    name: 'Aluno Autor (simulação)',
    email: 'author@example.invalid',
    institutionalLogin: 'dev-author',
    role: 'student',
    enrollment: 'DEV-AUTHOR',
  },
  researcher: {
    issuer: 'urn:subtccstack:development',
    subject: 'researcher',
    name: 'Aluno Pesquisador (simulação)',
    email: 'researcher@example.invalid',
    institutionalLogin: 'dev-researcher',
    role: 'student',
    enrollment: 'DEV-RESEARCHER',
  },
  professor: {
    issuer: 'urn:subtccstack:development',
    subject: 'professor',
    name: 'Professor (simulação)',
    email: 'professor@example.invalid',
    institutionalLogin: 'dev-professor',
    role: 'professor',
    department: 'Departamento de demonstração',
  },
} satisfies Record<string, VerifiedIdentity>;

export type DevelopmentPersona = keyof typeof developmentPersonas;

export function getDevelopmentIdentity(persona: string): VerifiedIdentity {
  if (!Object.hasOwn(developmentPersonas, persona)) {
    throw new Error('Identidade de desenvolvimento inválida.');
  }
  return { ...developmentPersonas[persona as DevelopmentPersona] };
}
