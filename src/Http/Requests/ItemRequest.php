<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Phattarachai\Kradan\Enums\ItemKind;

final class ItemRequest extends FormRequest
{
    public const array IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'];

    public const array COLORS = ['yellow', 'ink', 'red', 'orange', 'green', 'blue', 'pink'];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $kind = ItemKind::tryFrom((string) $this->input('kind'));

        return [
            'step' => ['required', 'string', 'max:512'],
            'round' => ['nullable', 'integer'],
            'kind' => ['required', Rule::enum(ItemKind::class)],
            ...self::anchorRules(),
            ...self::boxRules(required: true),
            ...self::contentRules(),
            'points' => [Rule::requiredIf($kind?->hasPoints() ?? false), 'nullable', 'array', 'max:5000'],
            'file' => [Rule::requiredIf($kind?->hasFile() ?? false), 'prohibited_unless:kind,image,file', 'file', 'max:'.(int) config('kradan.uploads.max_kb', 20480), ...$this->fileTypeRules($kind)],
        ];
    }

    /** @return array<string, mixed> */
    public static function anchorRules(): array
    {
        return [
            'anchor' => ['nullable', 'array'],
            'anchor.option' => ['nullable', 'string', 'max:64'],
            'anchor.device' => ['nullable', 'string', 'max:32'],
            'anchor.src' => ['nullable', 'string', 'max:2000'],
            'anchor.on' => ['nullable', 'boolean'],
        ];
    }

    /** @return array<string, mixed> */
    public static function boxRules(bool $required): array
    {
        return [
            'x' => [$required ? 'required' : 'sometimes', 'numeric'],
            'y' => [$required ? 'required' : 'sometimes', 'numeric'],
            'w' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'h' => ['sometimes', 'nullable', 'numeric', 'min:0'],
        ];
    }

    /** @return array<string, mixed> */
    public static function contentRules(): array
    {
        return [
            'color' => ['sometimes', 'nullable', Rule::in(self::COLORS)],
            'text' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'points' => ['sometimes', 'nullable', 'array', 'max:5000'],
            'points.*' => ['array', 'size:2'],
            'points.*.*' => ['numeric'],
            'texts' => ['sometimes', 'nullable', 'array', 'max:200'],
            'texts.*' => ['string', 'max:2000'],
        ];
    }

    /**
     * Images by their content, other files by their extension: those only
     * ever download, never render.
     *
     * @return list<string>
     */
    private function fileTypeRules(?ItemKind $kind): array
    {
        $types = array_map(strtolower(...), (array) config('kradan.uploads.types', []));

        return $kind === ItemKind::Image
            ? ['mimes:'.implode(',', array_intersect(self::IMAGE_TYPES, $types)), 'extensions:'.implode(',', array_intersect(self::IMAGE_TYPES, $types))]
            : ['extensions:'.implode(',', $types)];
    }
}
