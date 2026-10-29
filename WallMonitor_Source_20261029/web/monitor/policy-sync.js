                                                                               
                                                                             
export function syncPolicyEditor(editor, policy, { reset = false, render, conflict } = {}) {
  const changed = editor.policyRevision !== policy.revision;
  if (reset || editor.policyRevision === null || (!editor.dirty && changed)) {
    render(policy);
    editor.policyRevision = policy.revision;
    editor.dirty = false;
    return 'rendered';
  }
  if (editor.dirty && changed) {
    conflict?.({ editingRevision: editor.policyRevision, serverRevision: policy.revision });
    return 'conflict';
  }
  return 'unchanged';
}
