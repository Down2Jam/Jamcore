export function getActorPublicKeyId(actorId: string) {
  return `${actorId}#main-key`;
}

export function buildActorPublicKey(actorId: string, publicKeyPem: string) {
  return {
    id: getActorPublicKeyId(actorId),
    owner: actorId,
    publicKeyPem,
  };
}
