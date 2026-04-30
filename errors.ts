export async function fetchPubChem3dSdfByCid(
  cid: number
): Promise<string | null> {
  // 3D record may not exist for all CIDs.
  // PUG REST supports record_type=3d for compound record downloads.
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) return null;
  const text = await resp.text();
  if (!text || text.toLowerCase().includes("error")) return text || null;
  return text;
}
