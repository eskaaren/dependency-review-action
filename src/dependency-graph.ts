import * as core from '@actions/core'
import * as githubUtils from '@actions/github/lib/utils'
import * as retry from '@octokit/plugin-retry'
import {readConfig} from './config'
import {
  ChangesSchema,
  ComparisonResponse,
  ComparisonResponseSchema
} from './schemas'

const retryingOctokit = githubUtils.GitHub.plugin(retry.retry)
const SnapshotWarningsHeader = 'x-github-dependency-graph-snapshot-warnings'
const octo = new retryingOctokit(
  githubUtils.getOctokitOptions(core.getInput('repo-token', {required: true}))
)

export async function compare({
  owner,
  repo,
  baseRef,
  headRef
}: {
  owner: string
  repo: string
  baseRef: string
  headRef: string
}): Promise<ComparisonResponse> {
  const config = await readConfig()
  let snapshot_warnings = ''

  if (config.check_all_dependencies) {
    // Fetch the full dependency graph for the head reference
    const headDependencies = await octo.request(
      'GET /repos/{owner}/{repo}/dependency-graph/snapshots/{ref}',
      {
        owner,
        repo,
        ref: headRef
      }
    )

    console.log('headDependencies', headDependencies)

    // Parse the dependencies using the existing schema
    const headChanges = ChangesSchema.parse(headDependencies.data)

    if (
      headDependencies.headers[SnapshotWarningsHeader] &&
      typeof headDependencies.headers[SnapshotWarningsHeader] === 'string'
    ) {
      snapshot_warnings = Buffer.from(
        headDependencies.headers[SnapshotWarningsHeader],
        'base64'
      ).toString('utf-8')
    }

    return ComparisonResponseSchema.parse({
      changes: {head: headChanges},
      snapshot_warnings
    })
  } else {
    const changes = await octo.request(
      'GET /repos/{owner}/{repo}/dependency-graph/compare/{basehead}',
      {
        owner,
        repo,
        basehead: `${baseRef}...${headRef}`
      }
    )

    if (
      changes.headers[SnapshotWarningsHeader] &&
      typeof changes.headers[SnapshotWarningsHeader] === 'string'
    ) {
      snapshot_warnings = Buffer.from(
        changes.headers[SnapshotWarningsHeader],
        'base64'
      ).toString('utf-8')
    }

    return ComparisonResponseSchema.parse({
      changes: ChangesSchema.parse(changes.data),
      snapshot_warnings
    })
  }
}
