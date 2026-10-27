<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Node\Node;
use League\CommonMark\Renderer\ChildNodeRendererInterface;
use League\CommonMark\Renderer\NodeRendererInterface;

/**
 * A ```mermaid fence becomes the element mermaid draws; every other fence
 * falls through to the default renderer.
 */
final class MermaidRenderer implements NodeRendererInterface
{
    public bool $used = false;

    public function render(Node $node, ChildNodeRendererInterface $childRenderer): ?string
    {
        if (! $node instanceof FencedCode || strtolower(trim($node->getInfo() ?? '')) !== 'mermaid') {
            return null;
        }

        $this->used = true;

        return '<pre class="mermaid">'.e($node->getLiteral()).'</pre>';
    }
}
