<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Phattarachai\Kradan\Enums\BoardKind;

final class PushRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'bundle' => ['required', 'file', 'max:'.config('kradan.max_bundle_kb', 20480)],
            'slug' => ['required', 'string', 'max:120', 'regex:/^[a-z0-9][a-z0-9._-]*$/'],
            'kind' => ['nullable', Rule::enum(BoardKind::class)],
            'task_ref' => ['nullable', 'string', 'max:64'],
        ];
    }
}
