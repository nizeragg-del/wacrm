const GITHUB_API_URL = 'https://api.github.com'

export interface CreateRepoResult {
  repo_url: string
  clone_url: string
  repo_name: string
}

export async function createRepoAndPush(
  code: string,
  repoName: string,
  description: string,
): Promise<CreateRepoResult> {
  const githubToken = process.env.GITHUB_TOKEN || ''
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN environment variable not set')
  }

  const sanitizedName = repoName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)

  // Get authenticated user to find repo owner
  const userRes = await fetch(`${GITHUB_API_URL}/user`, {
    headers: { Authorization: `Bearer ${githubToken}` },
  })
  if (!userRes.ok) {
    const errorText = await userRes.text()
    throw new Error(`GitHub user lookup failed: ${errorText || userRes.statusText}`)
  }
  const userData = await userRes.json()
  const owner = userData.login
  if (!owner) throw new Error('GitHub user lookup returned no login')

  // Check if repo already exists
  const getRes = await fetch(`${GITHUB_API_URL}/repos/${owner}/${sanitizedName}`, {
    headers: { Authorization: `Bearer ${githubToken}` },
  })

  let repo: any
  if (getRes.ok) {
    repo = await getRes.json()
    console.log(`[github] repo ${sanitizedName} already exists, updating`)
  } else {
    // Create new repo
    const createRes = await fetch(`${GITHUB_API_URL}/user/repos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: sanitizedName,
        description: description.slice(0, 200),
        private: process.env.GITHUB_REPOS_PRIVATE !== 'false',
        auto_init: true,
      }),
    })

    if (!createRes.ok) {
      const err = await createRes.json()
      throw new Error(`GitHub create repo failed: ${err.message || createRes.statusText}`)
    }

    repo = await createRes.json()
  }

  const repoUrl = repo.html_url
  const cloneUrl = repo.clone_url

  const encodedContent = Buffer.from(code).toString('base64')

  // When updating an existing repo, GitHub requires the sha of the file
  // being replaced. Check if index.html already exists.
  let existingSha: string | undefined
  const existingRes = await fetch(
    `${GITHUB_API_URL}/repos/${repo.full_name}/contents/index.html`,
    { headers: { Authorization: `Bearer ${githubToken}` } },
  )
  if (existingRes.ok) {
    const existing = await existingRes.json()
    existingSha = existing.sha
  }

  const putRes = await fetch(`${GITHUB_API_URL}/repos/${repo.full_name}/contents/index.html`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'Initial commit - landing page',
      content: encodedContent,
      branch: 'main',
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  })

  if (!putRes.ok) {
    const err = await putRes.json()
    throw new Error(`GitHub push index.html failed: ${err.message || putRes.statusText}`)
  }

  return {
    repo_url: repoUrl,
    clone_url: cloneUrl,
    repo_name: sanitizedName,
  }
}
