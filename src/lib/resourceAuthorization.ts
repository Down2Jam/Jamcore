type GrantLike = {
  role: string;
  resourceType?: string | null;
  resourceId?: string | null;
};

export function hasResourceGrant(input: {
  grants?: GrantLike[] | null;
  resourceType: string;
  resourceId: string | number;
  allowedRoles?: string[];
}) {
  const allowedRoles = input.allowedRoles ?? ["resource.editor", "resource.admin"];
  return (input.grants ?? []).some(
    (grant) =>
      allowedRoles.includes(grant.role) &&
      grant.resourceType === input.resourceType &&
      String(grant.resourceId ?? "") === String(input.resourceId),
  );
}
