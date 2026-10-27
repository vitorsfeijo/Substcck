import * as oidc from 'openid-client';
import type {
  AuthorizationAttempt,
  IdentityAdapter,
  VerifiedIdentity,
} from '../models/auth.js';

export interface OidcOptions {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  roleClaim?: string;
  enrollmentClaim?: string;
  departmentClaim?: string;
  loginClaim?: string;
}

type ClaimOptions = Pick<
  OidcOptions,
  'issuer' | 'roleClaim' | 'enrollmentClaim' | 'departmentClaim' | 'loginClaim'
>;

function requiredString(claims: Record<string, unknown>, name: string): string {
  const value = claims[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Identidade institucional incompleta.');
  }
  return value.trim();
}

/** Claims have already passed signature, issuer, audience, lifetime and nonce checks. */
export function identityFromClaims(
  claims: Record<string, unknown>,
  options: ClaimOptions,
): VerifiedIdentity {
  if (claims.iss !== options.issuer || claims.email_verified !== true) {
    throw new Error('Identidade institucional não verificada.');
  }
  const role = claims[options.roleClaim || 'role'];
  if (role !== 'student' && role !== 'professor') {
    throw new Error('Vínculo institucional não autorizado.');
  }
  const identity: VerifiedIdentity = {
    issuer: options.issuer,
    subject: requiredString(claims, 'sub'),
    name: requiredString(claims, 'name'),
    email: requiredString(claims, 'email'),
    institutionalLogin: requiredString(
      claims,
      options.loginClaim || 'preferred_username',
    ),
    role,
  };
  if (role === 'student') {
    identity.enrollment = requiredString(
      claims,
      options.enrollmentClaim || 'enrollment',
    );
  } else {
    identity.department = requiredString(
      claims,
      options.departmentClaim || 'department',
    );
  }
  return identity;
}

export async function createOidcAdapter(
  options: OidcOptions,
): Promise<IdentityAdapter> {
  const issuer = new URL(options.issuer);
  const redirectUri = new URL(options.redirectUri);
  if (issuer.protocol !== 'https:' || redirectUri.protocol !== 'https:') {
    throw new Error('A integração institucional exige URLs HTTPS.');
  }
  const configuration = await oidc.discovery(
    issuer,
    options.clientId,
    options.clientSecret,
  );
  // Validate the ID token signature against the issuer's JWKS as well as claims.
  oidc.enableNonRepudiationChecks(configuration);
  return {
    async authorizationUrl(attempt: AuthorizationAttempt) {
      const challenge = await oidc.calculatePKCECodeChallenge(
        attempt.codeVerifier,
      );
      return oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: options.redirectUri,
        scope: 'openid profile email',
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: attempt.state,
        nonce: attempt.nonce,
      });
    },
    async callback(url: URL, attempt: AuthorizationAttempt) {
      if (
        url.origin !== redirectUri.origin ||
        url.pathname !== redirectUri.pathname
      ) {
        throw new Error('Retorno de autenticação inválido.');
      }
      const tokens = await oidc.authorizationCodeGrant(configuration, url, {
        pkceCodeVerifier: attempt.codeVerifier,
        expectedState: attempt.state,
        expectedNonce: attempt.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims) throw new Error('Identidade institucional ausente.');
      return identityFromClaims(claims, {
        ...options,
        issuer: configuration.serverMetadata().issuer,
      });
    },
  };
}
