import {
  WorkflowActionInputSchema,
  type PublishedFormVersion,
  type PublishedFormVersionSummary,
} from '@flowform/api-contracts'
import { ActorRoleSchema, FormDefinitionSchema } from '@flowform/form-schema'
import { WorkflowDefinitionSchema } from '@flowform/workflow-schema'
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common'
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import {
  ChangeRoleDto,
  CreateCommentDto,
  PublishDto,
  SubmitDto,
  UpdateDraftDto,
  WorkflowActionDto,
} from './sandbox.dto'
import { SandboxService } from './sandbox.service'
import type { CreateSandboxResult, DemoSandbox } from './sandbox.types'

const UpdateDraftSchema = z.object({
  expectedRevision: z.number().int().positive(),
  form: FormDefinitionSchema,
  workflow: WorkflowDefinitionSchema,
})
@ApiTags('sandboxes')
@Controller('sandboxes')
export class SandboxController {
  constructor(@Inject(SandboxService) private readonly sandboxes: SandboxService) {}

  @Post()
  @ApiOperation({ summary: 'Create an isolated 24-hour recruiter sandbox' })
  async create(): Promise<CreateSandboxResult> {
    return this.sandboxes.create()
  }

  @Get(':sandboxId')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Read the current sandbox aggregate' })
  get(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token?: string,
  ): Promise<DemoSandbox> {
    return this.sandboxes.get(sandboxId, token)
  }

  @Get(':sandboxId/versions')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'List immutable published version metadata' })
  listVersions(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token?: string,
  ): Promise<PublishedFormVersionSummary[]> {
    return this.sandboxes.listPublishedVersions(sandboxId, token)
  }

  @Get(':sandboxId/versions/:version')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Read one immutable published version' })
  getVersion(
    @Param('sandboxId') sandboxId: string,
    @Param('version') versionInput: string,
    @Headers('x-sandbox-token') token?: string,
  ): Promise<PublishedFormVersion> {
    const version = parse(z.coerce.number().int().positive(), versionInput)
    return this.sandboxes.getPublishedVersion(sandboxId, token, version)
  }

  @Patch(':sandboxId/role')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Switch the simulated actor in demo mode' })
  changeRole(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: ChangeRoleDto,
  ): Promise<DemoSandbox> {
    const role = parse(ActorRoleSchema, body.role)
    return this.sandboxes.changeRole(sandboxId, token, role)
  }

  @Put(':sandboxId/draft')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Save a form and workflow with optimistic concurrency' })
  updateDraft(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: UpdateDraftDto,
  ): Promise<DemoSandbox> {
    const input = parse(UpdateDraftSchema, body)
    return this.sandboxes.updateDraft(
      sandboxId,
      token,
      input.expectedRevision,
      input.form,
      input.workflow,
    )
  }

  @Post(':sandboxId/publish')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Create an immutable published version' })
  publish(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: PublishDto,
  ): Promise<DemoSandbox> {
    const expectedRevision = parse(z.number().int().positive(), body.expectedRevision)
    return this.sandboxes.publish(sandboxId, token, expectedRevision)
  }

  @Post(':sandboxId/submissions')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Submit answers against the immutable published version' })
  submit(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: SubmitDto,
  ): Promise<DemoSandbox> {
    const answers = parse(z.record(z.string(), z.unknown()), body.answers)
    return this.sandboxes.submit(sandboxId, token, answers)
  }

  @Post(':sandboxId/workflow-actions')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Approve, reject, clarify, or resubmit the active task' })
  action(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: WorkflowActionDto,
  ): Promise<DemoSandbox> {
    const action = parse(WorkflowActionInputSchema, body)
    return this.sandboxes.performAction(sandboxId, token, action)
  }

  @Post(':sandboxId/comments')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Create a contextual submission comment' })
  comment(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: CreateCommentDto,
  ): Promise<DemoSandbox> {
    const input = parse(
      z.object({ message: z.string().min(1).max(2_000), anchorFieldId: z.string().optional() }),
      body,
    )
    return this.sandboxes.addComment(sandboxId, token, input.message, input.anchorFieldId)
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new BadRequestException({ code: 'invalid_request', issues: result.error.issues })
  }
  return result.data
}
