<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    #[Override]
    public function getConnection(): ?string
    {
        return config('kradan.connection');
    }

    public function up(): void
    {
        $schema = Schema::connection($this->getConnection());

        $schema->create('kradan_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('board_id')->constrained('kradan_boards')->cascadeOnDelete();
            $table->foreignId('round_id')->nullable()->constrained('kradan_rounds')->nullOnDelete();
            $table->string('step_key', 512);
            $table->string('user_id', 64);
            $table->string('kind', 16);
            $table->json('anchor')->nullable();
            $table->double('x')->default(0);
            $table->double('y')->default(0);
            $table->double('w')->nullable();
            $table->double('h')->nullable();
            $table->string('color', 16)->nullable();
            $table->text('text')->nullable();
            $table->json('points')->nullable();
            $table->json('texts')->nullable();
            $table->string('file_path')->nullable();
            $table->string('file_name')->nullable();
            $table->string('file_type')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['board_id', 'step_key']);
        });

        $schema->table('kradan_comments', function (Blueprint $table): void {
            $table->unsignedBigInteger('item_id')->nullable()->after('parent_id')->index();
        });
    }

    public function down(): void
    {
        $schema = Schema::connection($this->getConnection());

        $schema->table('kradan_comments', function (Blueprint $table): void {
            $table->dropIndex(['item_id']);
            $table->dropColumn('item_id');
        });

        $schema->dropIfExists('kradan_items');
    }
};
