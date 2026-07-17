import { ApiProperty } from '@nestjs/swagger'

export class ChangeRoleDto {
  @ApiProperty({ enum: ['designer', 'applicant', 'reviewer', 'management'] })
  role: string
}

export class UpdateDraftDto {
  @ApiProperty()
  expectedRevision: number

  @ApiProperty({ type: Object })
  form: object

  @ApiProperty({ type: Object })
  workflow: object
}

export class PublishDto {
  @ApiProperty()
  expectedRevision: number
}

export class SubmitDto {
  @ApiProperty({ type: Object })
  answers: Record<string, unknown>
}

export class WorkflowActionDto {
  @ApiProperty({ enum: ['approve', 'requestClarification', 'resubmit', 'reject'] })
  type: string

  @ApiProperty({ required: false })
  message?: string
}

export class CreateCommentDto {
  @ApiProperty()
  message: string

  @ApiProperty({ required: false })
  anchorFieldId?: string
}
