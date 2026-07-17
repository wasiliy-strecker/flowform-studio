import { ActorRoleSchema, FormDefinitionSchema } from '@flowform/form-schema'
import { WorkflowDefinitionSchema } from '@flowform/workflow-schema'
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common'
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { RealtimeGateway } from '../realtime/realtime.gateway'
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
const WorkflowActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve') }),
  z.object({ type: z.literal('requestClarification'), message: z.string().min(1).max(2_000) }),
  z.object({ type: z.literal('resubmit'), message: z.string().max(2_000).optional() }),
  z.object({ type: z.literal('reject'), message: z.string().max(2_000).optional() }),
])

@ApiTags('sandboxes')
@Controller('sandboxes')
export class SandboxController {
  constructor(
    private readonly sandboxes: SandboxService,
    private readonly realtime: RealtimeGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an isolated 24-hour recruiter sandbox' })
  create(): CreateSandboxResult {
    return this.sandboxes.create()
  }

  @Get(':sandboxId')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Read the current sandbox aggregate' })
  get(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token?: string,
  ): DemoSandbox {
    return this.sandboxes.get(sandboxId, token)
  }

  @Patch(':sandboxId/role')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Switch the simulated actor in demo mode' })
  changeRole(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: ChangeRoleDto,
  ): DemoSandbox {
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
  ): DemoSandbox {
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
  ): DemoSandbox {
    const expectedRevision = parse(z.number().int().positive(), body.expectedRevision)
    const sandbox = this.sandboxes.publish(sandboxId, token, expectedRevision)
    this.realtime.emitStatus(sandboxId, sandbox)
    return sandbox
  }

  @Post(':sandboxId/submissions')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Submit answers against the immutable published version' })
  submit(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: SubmitDto,
  ): DemoSandbox {
    const answers = parse(z.record(z.string(), z.unknown()), body.answers)
    const sandbox = this.sandboxes.submit(sandboxId, token, answers)
    this.realtime.emitStatus(sandboxId, sandbox)
    return sandbox
  }

  @Post(':sandboxId/workflow-actions')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Approve, reject, clarify, or resubmit the active task' })
  action(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: WorkflowActionDto,
  ): DemoSandbox {
    const action = parse(WorkflowActionSchema, body)
    const sandbox = this.sandboxes.performAction(
      sandboxId,
      token,
      action.type === 'resubmit' || action.type === 'reject'
        ? action.message
          ? { type: action.type, message: action.message }
          : { type: action.type }
        : action,
    )
    this.realtime.emitStatus(sandboxId, sandbox)
    return sandbox
  }

  @Post(':sandboxId/comments')
  @ApiSecurity('sandbox')
  @ApiOperation({ summary: 'Create a contextual submission comment' })
  comment(
    @Param('sandboxId') sandboxId: string,
    @Headers('x-sandbox-token') token: string | undefined,
    @Body() body: CreateCommentDto,
  ): DemoSandbox {
    const input = parse(
      z.object({ message: z.string().min(1).max(2_000), anchorFieldId: z.string().optional() }),
      body,
    )
    const result = this.sandboxes.addComment(sandboxId, token, input.message, input.anchorFieldId)
    this.realtime.emitComment(sandboxId, result.comment)
    return result.sandbox
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new BadRequestException({ code: 'invalid_request', issues: result.error.issues })
  }
  return result.data
}
